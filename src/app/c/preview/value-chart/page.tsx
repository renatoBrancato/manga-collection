import { notFound } from "next/navigation";
import ValueBreakdownPreview from "@/components/ValueBreakdownPreview";

export default function ValueChartPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ValueBreakdownPreview />;
}
