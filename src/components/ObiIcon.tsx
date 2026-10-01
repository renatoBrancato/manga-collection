/**
 * Fascetta OBI, resa come fascia con il fiocco. Vive in un file suo perché
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
      <path d="M4.2 5.4h15.6v3.9c0 .9-.6 1.7-1.5 1.9L12 12.6l-6.3-1.4c-.9-.2-1.5-1-1.5-1.9V5.4Z" />
      <path d="M9.2 12.9 8 20.4l4-2.3 4 2.3-1.2-7.5" />
    </svg>
  );
}
