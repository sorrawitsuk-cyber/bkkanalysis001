import type { Layer } from "leaflet";

type FocusableLeafletLayer = Layer & {
  getElement?: () => HTMLElement | null;
};

export function bindLeafletKeyboardSelection(
  layer: Layer,
  ariaLabel: string,
  onSelect: () => void,
) {
  const focusableLayer = layer as FocusableLeafletLayer;

  const configureElement = () => {
    const element = focusableLayer.getElement?.();
    if (!element || element.dataset.mapKeyboardSelectable === "true") return;

    element.dataset.mapKeyboardSelectable = "true";
    element.classList.add("map-keyboard-target");
    element.setAttribute("tabindex", "0");
    element.setAttribute("focusable", "true");
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", ariaLabel);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
      event.preventDefault();
      event.stopPropagation();
      onSelect();
    };

    element.addEventListener("keydown", handleKeyDown);
    layer.once("remove", () => element.removeEventListener("keydown", handleKeyDown));
  };

  if (focusableLayer.getElement?.()) configureElement();
  else layer.once("add", configureElement);
}
