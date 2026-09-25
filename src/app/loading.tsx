// Full-screen loading screen shown by Next.js while a page is loading (route changes).
import LoadingScreen from "@/components/LoadingScreen";

export default function Loading() {
  return <LoadingScreen label="Loading" full />;
}
