const DONATE_URL = process.env.NEXT_PUBLIC_DONATE_URL || "https://paypal.me/AkatsukiBank";

/** Link PayPal per sostenere il progetto. */
export default function DonateButton() {
  return (
    <a
      href={DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-400/20 hover:text-amber-100"
      title="Sostieni il progetto con PayPal"
    >
      <span aria-hidden="true">☕</span>
      Dona
    </a>
  );
}
