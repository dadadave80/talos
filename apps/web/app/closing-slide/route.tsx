import { closingSlide } from "@/lib/share";

// S5: the video's closing slide as a 1920×1080 PNG with live counters. Save it from the browser when recording.
export const dynamic = "force-dynamic";

export function GET() {
  return closingSlide();
}
