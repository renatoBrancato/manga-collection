/**
 * Fascetta OBI: il libro visto di fronte con la fascia di carta che avvolge
 * la parte bassa della copertina. Vive in un file suo perché deve essere
 * identica ovunque compaia (riquadri KPI e schede della collezione),
 * altrimenti l'utente non riconosce che indicano la stessa cosa.
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
      <path d="M6.6 3.4h10.8v17.2H6.6z" />
      <path d="M3.6 14h16.8v4.4H3.6z" fill="currentColor" fillOpacity="0.22" />
      <path d="M9.6 6.6h4.8" />
    </svg>
  );
}
