export function ShieldMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M16 2.5 5 6.5v8.2c0 7 4.6 12.4 11 14.8 6.4-2.4 11-7.8 11-14.8V6.5L16 2.5Z" fill="#185d97" />
      <path
        d="M9.5 18.5c.6-1.6 1.6-2.6 3-3.1l1.6-2.1c.4-.5 1-.8 1.6-.8h3.2c.7 0 1.3.4 1.6 1l1.1 1.9c1.4.4 2.3 1.3 2.4 2.7v1.5h-1.7a1.9 1.9 0 0 0-3.7 0h-4.2a1.9 1.9 0 0 0-3.7 0H9.5v-1.1Z"
        fill="#fff"
      />
    </svg>
  );
}
