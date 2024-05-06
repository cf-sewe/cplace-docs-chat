// Importing the Source type from the SourceBubble component
import { Source } from "./SourceBubble";

// Defining the InlineCitation component
export function InlineCitation(props: {
  source: Source; // Source object containing URL and title
  sourceNumber: number; // Number representing the source
  highlighted: boolean; // Flag indicating whether the source is highlighted
  onMouseEnter: () => any; // Function called when mouse enters the link
  onMouseLeave: () => any; // Function called when mouse leaves the link
}) {
  // Destructuring props to access individual properties
  const { source, sourceNumber, highlighted, onMouseEnter, onMouseLeave } = props;
  return (
    <a
      href={source.url} // Setting the URL for the link
      target="_blank" // Opening the link in a new tab
      // Applying CSS classes based on whether the source is highlighted
      className={`relative bottom-1.5 text-xs border rounded px-1 ${
        highlighted ? "bg-[rgb(58,58,61)]" : "bg-[rgb(78,78,81)]"
      }`}
      // Handling mouse enter event
      onMouseEnter={onMouseEnter}
      // Handling mouse leave event
      onMouseLeave={onMouseLeave}
    >
      {sourceNumber} {/* Rendering the source number */}
    </a>
  );
}
