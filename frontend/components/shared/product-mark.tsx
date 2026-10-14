export default function ProductMark({ size = 20 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 6v12M17 6v3a4 4 0 0 1-4 4H7" />
      <circle cx="7" cy="4" r="2" />
      <circle cx="7" cy="20" r="2" />
      <circle cx="17" cy="4" r="2" />
    </svg>
  );
}
