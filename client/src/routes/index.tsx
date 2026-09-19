import { createFileRoute } from "@tanstack/react-router";
import { RBAssistantWindow } from "@/components/RBAssistantWindow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RB Assistant — Floating AI Answer Window" },
      {
        name: "description",
        content:
          "RB Assistant is a floating desktop-style AI window with resizable S/M/L presets, instant answers and one-click copy.",
      },
      { property: "og:title", content: "RB Assistant — Floating AI Answer Window" },
      {
        property: "og:description",
        content:
          "A frosted-glass desktop assistant window with size presets, drag resize and quick capture.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="rb-desktop flex min-h-screen w-full items-center justify-center p-4 md:p-8">
      <RBAssistantWindow />
    </div>
  );
}
