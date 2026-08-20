import { Check, X } from "lucide-react";

export default function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="clay-toast fixed bottom-6 right-6 z-[100] flex max-w-sm animate-enter items-center gap-3 rounded-2xl border border-white/70 bg-ink px-4 py-3 text-sm font-semibold text-white shadow-lift" role="status">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-jade"><Check size={15} /></span>
      <span>{message}</span>
      <button className="ml-1 rounded-lg p-1 text-white/60 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Close notification"><X size={15} /></button>
    </div>
  );
}
