import React from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open,
  onOpenChange,
  title = 'Are you sure?',
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  destructive = false,
  extra = null,
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="p-0 gap-0 max-w-[440px] overflow-hidden border hairline shadow-[var(--shadow-lg)] rounded-xl">
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-start gap-4">
            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${
              destructive
                ? 'bg-red-50 border-red-100'
                : 'bg-[color:var(--accent-teal-wash)] border-[color:var(--accent-teal)]/20'
            }`}>
              <AlertTriangle size={18} className={destructive ? 'text-red-600' : 'text-[color:var(--accent-teal)]'} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <AlertDialogTitle className="text-[15px] font-semibold tracking-[-0.01em] text-ink leading-snug">
                {title}
              </AlertDialogTitle>
              {description && (
                <AlertDialogDescription className="text-[13px] mt-1.5 text-ink-muted leading-relaxed">
                  {description}
                </AlertDialogDescription>
              )}
            </div>
          </div>
          {extra && <div className="mt-5 ml-14">{extra}</div>}
        </div>
        <AlertDialogFooter className="px-6 py-4 bg-[color:var(--surface-hover)] hairline-t gap-2 sm:gap-2">
          <AlertDialogCancel className="h-9 px-4 text-[13px] font-medium border hairline bg-white hover:bg-[color:var(--surface-subtle)] text-ink-3 hover:text-ink mt-0 shadow-none">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={`h-9 px-4 text-[13px] font-semibold text-white shadow-[0_1px_0_rgba(0,0,0,0.05)] border-0 ${
              destructive
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[color:var(--accent-teal)] hover:bg-[color:var(--accent-teal-hover)]'
            }`}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
