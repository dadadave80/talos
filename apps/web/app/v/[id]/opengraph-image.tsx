import { notFound } from "next/navigation";
import { receipt, receiptImage } from "@/lib/share";

export const alt = "A Talos verdict receipt";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const r = await receipt((await params).id);
  if (!r) notFound();
  return receiptImage(r, size);
}
