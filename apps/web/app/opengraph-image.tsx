import { ogImage } from "@/lib/share";

export const alt = "Talos: an AI treasury on Arc. Try to rob it.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 300; // live counters, refreshed every 5 minutes

export default function Image() {
  return ogImage(size);
}
