"""Synthetic dosage/export regressions: no database, patient or Dropbox writes."""
import asyncio
import copy
from datetime import datetime
from types import SimpleNamespace

import pytest
from bson import ObjectId
from pydantic import ValidationError

from supplements.calculations import recalculate_plan_costs
from supplements.dosage import parse_timed_dosage
from supplements.models import PlanSupplementEntry, PlanUpdate, TemplateSupplementEntry
from supplements import pdf_generator, routes, dropbox_integration


SPLIT = [{"time": "AM", "quantity": 1}, {"time": "PM", "quantity": 2}]


def supplement(**changes):
    return {"supplement_id": "test", "supplement_name": "Example", "quantity_per_dose": 1,
            "frequency_per_day": 2, "dosage_display": "1 cap AM / 2 caps PM", "units_per_bottle": 60,
            "cost_per_bottle": 10, **changes}


def test_split_dose_survives_plan_and_template_roundtrip():
    for model in (PlanSupplementEntry, TemplateSupplementEntry):
        parsed = model.model_validate(supplement()).model_dump()
        assert parsed["dose_schedule"] == SPLIT
        assert parsed["quantity_per_dose"] is None
        assert parsed["times"] == ["AM", "PM"]
        assert model.model_validate(parsed).model_dump() == parsed
    body = PlanUpdate(months=[{"month_number": 1, "supplements": [supplement()]}]).model_dump()
    assert body["months"][0]["supplements"][0]["dose_schedule"] == SPLIT


def test_explicit_schedule_overrides_stale_legacy_scalars():
    entry = PlanSupplementEntry.model_validate(supplement(dose_schedule=[{"time": "PM", "quantity": 2.5}]))
    assert entry.quantity_per_dose == 2.5
    assert entry.frequency_per_day == 1
    assert entry.times == ["PM"]


@pytest.mark.parametrize("schedule", [[], [{"time": "AM", "quantity": 0}], [{"time": "AM", "quantity": -1}],
    [{"time": "AM", "quantity": float("inf")}], [{"time": "bedtime", "quantity": 1}],
    [{"time": "AM", "quantity": 1}, {"time": "AM", "quantity": 2}]])
def test_invalid_explicit_schedule_rejected(schedule):
    with pytest.raises(ValidationError):
        PlanSupplementEntry.model_validate(supplement(dose_schedule=schedule))


def test_full_text_only_and_unequal_dash_schedule():
    assert parse_timed_dosage("1-2-3") == [
        {"time": "AM", "quantity": 1}, {"time": "Afternoon", "quantity": 2}, {"time": "PM", "quantity": 3}]
    assert parse_timed_dosage("1 AM / 2 PM then 3 tomorrow") is None
    assert parse_timed_dosage("1-2 caps per day") is None


def test_split_dose_bottles_and_surplus_match_patient_consumption():
    plan = {"months": [{"month_number": number, "supplements": [supplement()]} for number in (1, 2)]}
    result = recalculate_plan_costs(plan)
    assert [m["supplements"][0]["bottles_needed"] for m in result["months"]] == [2, 1]
    assert result["total_program_cost"] == 30
    # An ordinary legacy uniform plan keeps its existing arithmetic.
    uniform = {"months": [{"month_number": 1, "supplements": [supplement(dosage_display="2 caps per day", quantity_per_dose=2, frequency_per_day=1)]}]}
    assert recalculate_plan_costs(uniform)["months"][0]["supplements"][0]["bottles_needed"] == 1


def test_patient_pdf_draws_different_amounts_in_each_time_table(monkeypatch):
    cells = []
    original = pdf_generator.ProtocolPDF.cell

    def capture(self, *args, **kwargs):
        cells.append(args[2] if len(args) > 2 else kwargs.get("text", ""))
        return original(self, *args, **kwargs)

    monkeypatch.setattr(pdf_generator.ProtocolPDF, "cell", capture)
    pdf = pdf_generator.generate_patient_pdf({"patient_name": "Test", "program_name": "Test", "step_label": "Step 1", "months": [{"month_number": 1, "supplements": [supplement(bottles_needed=1)]}]})
    assert bytes(pdf).startswith(b"%PDF")
    am, pm = cells.index("  AM"), cells.index("  PM")
    assert " 1 cap" in cells[am:pm]
    assert " 2 caps" in cells[pm:]
    assert " 1 cap" not in cells[pm:]
    order = cells.index("Month 1 Order")
    assert "2" in cells[order:]  # 90 capsules require two 60-capsule bottles, not the stored one.


def test_cloud_filename_distinguishes_plans_and_is_stable_for_reexport():
    first = {"_id": ObjectId(), "created_at": datetime(2026, 4, 13), "patient_name": "Test", "program_name": "Gut", "step_label": "Step 1"}
    second = {**first, "_id": ObjectId()}
    first_filename = routes.cloud_plan_filename(first)
    assert first_filename != routes.cloud_plan_filename(second)
    assert "2026-04-13" in first_filename
    assert str(first["_id"]) not in first_filename
    assert first_filename.endswith(f"{str(first['_id'])[-6:]}.pdf")
    assert first_filename == routes.cloud_plan_filename({**first, "updated_at": datetime(2026, 9, 1)})
    assert "/" not in routes.cloud_plan_filename({**first, "program_name": "Gut/Health"})


def test_bulk_and_single_export_share_unique_paths(monkeypatch):
    patient_id = ObjectId()
    plans = [{"_id": ObjectId(), "created_at": datetime(2026, 4, 13), "patient_id": str(patient_id),
              "patient_name": "Test (Copy)", "program_name": "Gut", "step_label": "Step 1", "months": []} for _ in range(2)]

    class Collection:
        def __init__(self, docs):
            self.docs = docs
        async def find_one(self, query):
            return copy.deepcopy(next((doc for doc in self.docs if doc["_id"] == query["_id"]), None))
        def find(self, query):
            return self
        def sort(self, *args):
            return self
        async def to_list(self, length):
            return copy.deepcopy(self.docs)

    monkeypatch.setattr(routes, "db", SimpleNamespace(plans=Collection(plans), patients=Collection([{"_id": patient_id, "name": "Test"}])))
    async def auth(_): return {"name": "Coach"}
    async def identity(plan): return plan
    async def freight(): return {}
    monkeypatch.setattr(routes, "get_current_user", auth)
    monkeypatch.setattr(routes, "sync_plan_with_master", identity)
    monkeypatch.setattr(routes, "get_company_freight_map", freight)
    monkeypatch.setattr(routes, "generate_patient_pdf", lambda plan: b"synthetic-pdf")
    uploads = []
    def upload(practitioner, patient, filename, contents):
        path = f"/{practitioner}/{patient}/{filename}"
        uploads.append(path)
        return {"file_path": path}
    monkeypatch.setattr(dropbox_integration, "upload_pdf", upload)

    bulk = asyncio.run(routes.save_all_plans_to_cloud(str(patient_id), user={"name": "Coach"}))
    assert bulk["files_uploaded"] == bulk["plans_exported"] == len(set(uploads)) == 2
    single = asyncio.run(routes.save_plan_to_cloud(str(plans[0]["_id"]), authorization="synthetic"))
    assert single["patient_pdf"]["file_path"] == uploads[0]
    assert len(set(uploads)) == 2
