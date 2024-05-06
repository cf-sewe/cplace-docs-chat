// Importing CSS styles for React Toastify and components from Chakra UI library
import "react-toastify/dist/ReactToastify.css";
import { Card, CardBody, Heading } from "@chakra-ui/react";
// Importing a function to send feedback from a utility file
import { sendFeedback } from "../utils/sendFeedback";

// Defining the type for a source object
export type Source = {
  url: string;
  title: string;
};

// Defining the SourceBubble component
export function SourceBubble({
  source,
  highlighted,
  onMouseEnter,
  onMouseLeave,
  runId,
}: {
  source: Source; // Source object containing URL and title
  highlighted: boolean; // Flag indicating whether the source is highlighted
  onMouseEnter: () => any; // Function called when mouse enters the card
  onMouseLeave: () => any; // Function called when mouse leaves the card
  runId?: string; // Optional ID for tracking
}) {
  return (
    <Card
      // Handling click event to open the source URL in a new tab
      onClick={async () => {
        window.open(source.url, "_blank");
        // If runId is provided, send feedback
        if (runId) {
          await sendFeedback({
            key: "user_click", // Feedback key
            runId, // ID for tracking
            value: source.url, // URL value
            isExplicit: false, // Flag indicating whether the feedback is explicit
          });
        }
      }}
      // Setting background color based on whether the source is highlighted
      backgroundColor={highlighted ? "rgb(58, 58, 61)" : "rgb(78,78,81)"}
      // Handling mouse enter event
      onMouseEnter={onMouseEnter}
      // Handling mouse leave event
      onMouseLeave={onMouseLeave}
      cursor={"pointer"} // Setting cursor to pointer
      alignSelf={"stretch"} // Setting alignment
      height="100%" // Setting height
      overflow={"hidden"} // Handling overflow
    >
      <CardBody>
        <Heading size={"sm"} fontWeight={"normal"} color={"white"}>
          {source.title} {/* Rendering the source title */}
        </Heading>
      </CardBody>
    </Card>
  );
}
