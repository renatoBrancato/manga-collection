/**
 * Fascetta OBI, resa come nastro annodato (lo stesso segno dell'emoji 🎗️). Vive in un file suo perché
 * deve essere identica ovunque compaia (riquadri KPI e schede della
 * collezione), altrimenti non si riconosce che indicano la stessa cosa.
 */
export default function ObiIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8.3 11.4C6.4 8.6 7 5.1 10 3.8a5 5 0 0 1 4 0c3 1.3 3.6 4.8 1.7 7.6" />
      <path d="m8.3 11.4 6 9.2" />
      <path d="m15.7 11.4-6 9.2" />
    </svg>
  );
}
