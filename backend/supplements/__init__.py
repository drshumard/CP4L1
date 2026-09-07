"""Supplement Protocol Manager, absorbed from the standalone supplementor app.

Wire-up (done in server.py):
    import supplements
    supplements.init(secret_key=SECRET_KEY, users_collection=db.users,
                     database=client["supplements"])
    app.include_router(supplements.router, prefix="/api/supplements")
    # and from the startup hook:
    await supplements.ensure_indexes_and_seed()
"""
from . import auth as _auth
from . import routes as _routes
from .routes import router, ensure_indexes_and_seed  # noqa: F401


def init(*, secret_key: str, users_collection, database, caps_resolver=None) -> None:
    """Inject the portal's JWT secret + users collection (auth), the dedicated
    `supplements` database (data), and the portal capability resolver (RBAC).
    Must run before the router serves a request."""
    _auth.init(secret_key, users_collection, caps_resolver)
    _routes.db = database
