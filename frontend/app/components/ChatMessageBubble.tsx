import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { emojiBlast } from "emoji-blast";
import { useState, useRef } from "react";
import DOMPurify from "dompurify";
import { marked } from 'marked';
import hljs from "highlight.js";

import { SourceBubble, Source } from "./SourceBubble";
import {
  VStack,
  Flex,
  Heading,
  HStack,
  Box,
  Tooltip,
  Button,
  Divider,
  Spacer,
} from "@chakra-ui/react";
import { sendFeedback } from "../utils/sendFeedback";
import { apiBaseUrl } from "../utils/constants";
import { InlineCitation } from "./InlineCitation";

export type Message = {
  id: string;
  createdAt?: Date;
  content: string;
  type: "system" | "human" | "ai" | "function";
  runId?: string;
  sources?: Source[];
  name?: string;
  function_call?: { name: string };
};
export type Feedback = {
  feedback_id: string;
  run_id: string;
  key: string;
  score: number;
  comment?: string;
};

// Function to filter duplicate sources based on their URLs
const filterSources = (sources: Source[]) => {
  const filtered: Source[] = [];
  const urlMap = new Map<string, number>();
  const indexMap = new Map<number, number>();
  sources.forEach((source, i) => {
    const { url } = source;
    const index = urlMap.get(url);
    if (index === undefined) {
      urlMap.set(url, i);
      indexMap.set(i, filtered.length);
      filtered.push(source);
    } else {
      const resolvedIndex = indexMap.get(index);
      if (resolvedIndex !== undefined) {
        indexMap.set(i, resolvedIndex);
      }
    }
  });
  return { filtered, indexMap };
};

const markedRenderer = {
  useNewRenderer: true,
  renderer: {
    paragraph({ tokens }: { tokens: any[] }) {
      // Iterate over all tokens and concatenate their text
      const paragraphText = tokens.map((token) => token.text).join('');
      const parsed = marked.parseInline(paragraphText, { async: false });
      return `${parsed}\n`;
    },
    listitem({ text }: { text: string }) {
      const parsed = marked.parseInline(text, { async: false });
      return `➤ ${parsed}\n`;
    },
    code({ text, lang, escaped }: { text: string; lang?: string; escaped?: boolean }) {
      // Ensure code does not have a trailing newline
      const code = text.replace(/\n$/, '') + '\n';

      // If a language is specified, return the highlighted code but without the <pre> and <code> tags
      const highlightedCode = hljs.highlight(code, { language: lang || 'plaintext' }).value;
      return `<div class="highlighted-code" style="background: #d2d6d6; padding: 8px; border-radius: 5px; overflow-x: auto; font-family: monospace;">${highlightedCode}</div>\n`;
    },
  },
};

function postprocess(html: string) {
  return DOMPurify.sanitize(html);
}

const createAnswerElements = (
  content: string, // The markdown content that will be parsed and rendered.
  filteredSources: Source[], // The sources that need to be highlighted or referenced.
  sourceIndexMap: Map<number, number>, // A map to match citation numbers with their respective sources.
  highlighedSourceLinkStates: boolean[], // The current state of highlighted source links (for hover effects).
  setHighlightedSourceLinkStates: React.Dispatch<
    React.SetStateAction<boolean[]>
  >, // A function to update the highlight state of source links.
) => {
  // Match all inline citation patterns like [^0], [^1], etc., from the content.
  //const matches = Array.from(content.matchAll(/\[\^?\$?{?(\d+)}?\^?\]/g));
  const matches = Array.from(content.matchAll(/\[\^(\d+)\]/g));
  // Array to store the final elements to render, including markdown and citations.
  const elements: JSX.Element[] = [];

  // Variable to track the last processed index in the content.
  let prevIndex = 0;

  // Initialize the marked renderer with syntax highlighting.
  //const marked = new Marked(
  //);

  // Apply the custom renderer and post-processing hooks.
  marked.use(markedRenderer);
  marked.use({ hooks: { postprocess } });

  // Iterate through the found matches of citations in the content.
  matches.forEach((match) => {
    // Extract the source number from the citation (e.g., [^0] -> 0).
    const sourceNum = parseInt(match[1], 10);

    // Find the resolved index for this source number from the sourceIndexMap.
    const resolvedNum = sourceIndexMap.get(sourceNum) ?? 10;

    // If the match has a valid index and is within bounds of available sources:
    if (match.index !== null && resolvedNum < filteredSources.length) {
      // Push the non-citation portion of the content to elements.
      elements.push(
        <span
          key={`content:${prevIndex}`}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(
              // Parse the markdown content between citations and sanitize it.
              marked.parse(content.slice(prevIndex, match.index), { async: false }).trimEnd(),
            ),
          }}
        ></span>,
      );

      // Push the inline citation component for this source.
      elements.push(
        <InlineCitation
          key={`citation:${prevIndex}`}
          source={filteredSources[resolvedNum]} // The source linked to the citation.
          sourceNumber={resolvedNum} // The source number shown in the citation.
          highlighted={highlighedSourceLinkStates[resolvedNum]} // Whether this source is highlighted.
          // Set highlighting on mouse enter.
          onMouseEnter={() =>
            setHighlightedSourceLinkStates(
              filteredSources.map((_, i) => i === resolvedNum), // Only highlight the current source.
            )
          }
          // Remove highlighting on mouse leave.
          onMouseLeave={() =>
            setHighlightedSourceLinkStates(filteredSources.map(() => false)) // Remove all highlighting.
          }
        />,
      );

      // Update prevIndex to the end of the current match to continue processing the rest of the content.
      prevIndex = (match?.index ?? 0) + match[0].length;
    }
  });

  // Add any remaining text after the last citation to the elements array.
  elements.push(
    <span
      key={`content:${prevIndex}`}
      dangerouslySetInnerHTML={{
        __html: DOMPurify.sanitize(
          marked.parse(content.slice(prevIndex), { async: false }).trimEnd(),
        ),
      }}
    ></span>,
  );

  // Return the final array of JSX elements, including parsed markdown and citations.
  return elements;
};



export function ChatMessageBubble(props: {
  message: Message;
  aiEmoji?: string;
  isMostRecent: boolean;
  messageCompleted: boolean;
}) {
  const { type, content, runId } = props.message;
  const isUser = type === "human";
  const [isLoading, setIsLoading] = useState(false);
  const [traceIsLoading, setTraceIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [comment, setComment] = useState("");
  const [feedbackColor, setFeedbackColor] = useState("");
  const upButtonRef = useRef(null);
  const downButtonRef = useRef(null);
  const [publicTraceLink, setPublicTraceLink] = useState<string | null>(null);

  const cumulativeOffset = function (element: HTMLElement | null) {
    var top = 0,
      left = 0;
    do {
      top += element?.offsetTop || 0;
      left += element?.offsetLeft || 0;
      element = (element?.offsetParent as HTMLElement) || null;
    } while (element);

    return {
      top: top,
      left: left,
    };
  };

  const sendUserFeedback = async (score: number, key: string) => {
    let run_id = runId;
    if (run_id === undefined) {
      return;
    }
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const data = await sendFeedback({
        score,
        runId: run_id,
        key,
        feedbackId: feedback?.feedback_id,
        comment,
        isExplicit: true,
      });
      if (data.code === 200) {
        setFeedback({ run_id, score, key, feedback_id: data.feedbackId });
        score == 1 ? animateButton("upButton") : animateButton("downButton");
        if (comment) {
          setComment("");
        }
      }
    } catch (e: any) {
      console.error("Error:", e);
      toast.error(e.message);
    }
    setIsLoading(false);
  };

  const viewTrace = async () => {
    try {
      if (traceIsLoading || publicTraceLink) {
        if (publicTraceLink) {
          window.open(publicTraceLink, "_blank");
        }
        return;
      }
      setTraceIsLoading(true);
      const response = await fetch(apiBaseUrl + "/chat/public_trace_link", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: runId,
        }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          toast.error("Feedback endpoint not found.");
        } else {
          const errorResponse = await response.json();
          toast.error(errorResponse.detail || "Error occurred");
        }
        setTraceIsLoading(false);
        return;
      }

      const data = await response.json();
      setTraceIsLoading(false);
      setPublicTraceLink(data.public_url);
      window.open(data.public_url, "_blank");
    } catch (e: any) {
      console.error("Error:", e);
      setTraceIsLoading(false);
      toast.error(e.message);
    }
  };

  const sources = props.message.sources ?? [];
  const { filtered: filteredSources, indexMap: sourceIndexMap } = filterSources(sources);

  const [highlighedSourceLinkStates, setHighlightedSourceLinkStates] = useState(
    filteredSources.map(() => false),
  );
  const answerElements =
    type === "ai"
      ? createAnswerElements(
          content,
          filteredSources,
          sourceIndexMap,
          highlighedSourceLinkStates,
          setHighlightedSourceLinkStates,
        )
      : [];

  const animateButton = (buttonId: string) => {
    let button: HTMLButtonElement | null;
    if (buttonId === "upButton") {
      button = upButtonRef.current;
    } else if (buttonId === "downButton") {
      button = downButtonRef.current;
    } else {
      return;
    }
    if (!button) return;
    let resolvedButton = button as HTMLButtonElement;
    resolvedButton.classList.add("animate-ping");
    setTimeout(() => {
      resolvedButton.classList.remove("animate-ping");
    }, 500);

    emojiBlast({
      emojiCount: 10,
      uniqueness: 1,
      position() {
        const offset = cumulativeOffset(button);

        return {
          x: offset.left + resolvedButton.clientWidth / 2,
          y: offset.top + resolvedButton.clientHeight / 2,
        };
      },
      emojis: buttonId === "upButton" ? ["👍"] : ["👎"],
    });
  };

  return (
    <VStack align="start" spacing={5} pb={5}>
      {!isUser && filteredSources.length > 0 && (
        <>
          <Flex direction={"column"} width={"100%"}>
            <VStack spacing={"5px"} align={"start"} width={"100%"}>
              <Heading
                fontSize="lg"
                fontWeight={"medium"}
                mb={1}
                color={"primary.blue"}
                paddingBottom={"10px"}
              >
                Sources
              </Heading>
              <HStack spacing={"10px"} maxWidth={"100%"} overflow={"auto"}>
                {filteredSources.map((source, index) => (
                  // Add Tooltip around the entire Box to display the source URL when hovering
                  <Tooltip key={index} label={source.url} placement="top" hasArrow>
                    <Box
                      alignSelf={"stretch"}
                      width={40}
                      cursor="pointer"
                      onMouseEnter={() =>
                        setHighlightedSourceLinkStates(
                          filteredSources.map((_, i) => i === index)
                        )
                      }
                      onMouseLeave={() =>
                        setHighlightedSourceLinkStates(
                          filteredSources.map(() => false)
                        )
                      }
                    >
                      <SourceBubble
                        source={source}
                        highlighted={highlighedSourceLinkStates[index]}
                        onMouseEnter={() =>
                          setHighlightedSourceLinkStates(
                            filteredSources.map((_, i) => i === index)
                          )
                        }
                        onMouseLeave={() =>
                          setHighlightedSourceLinkStates(
                            filteredSources.map(() => false)
                          )
                        }
                        runId={runId}
                      />
                    </Box>
                  </Tooltip>
                ))}
              </HStack>
            </VStack>
          </Flex>
  
          <Heading size="lg" fontWeight="medium" color="primary.blue">
            Answer
          </Heading>
        </>
      )}
  
      {isUser ? (
        <Heading size="lg" fontWeight="medium">
          {content}
        </Heading>
      ) : (
        <Box className="whitespace-pre-wrap">
          {answerElements}
        </Box>
      )}
  
      {props.message.type !== "human" &&
        props.isMostRecent &&
        props.messageCompleted && (
          <HStack spacing={2}>
            <Button
              ref={upButtonRef}
              size="sm"
              variant="outline"
              colorScheme={feedback === null ? "primary.mint" : "gray"} // Use the company mint color
              onClick={() => {
                if (feedback === null && props.message.runId) {
                  sendUserFeedback(1, "user_score");
                  animateButton("upButton");
                  setFeedbackColor("border-4 border-primary.mint");
                } else {
                  toast.error("You have already provided your feedback.");
                }
              }}
            >
              👍
            </Button>
            <Button
              ref={downButtonRef}
              size="sm"
              variant="outline"
              colorScheme={feedback === null ? "primary.red" : "gray"} // Use the company red color
              onClick={() => {
                if (feedback === null && props.message.runId) {
                  sendUserFeedback(0, "user_score");
                  animateButton("downButton");
                  setFeedbackColor("border-4 border-primary.red");
                } else {
                  toast.error("You have already provided your feedback.");
                }
              }}
            >
              👎
            </Button>
            <Spacer />
            <Button
              size="sm"
              variant="outline"
              colorScheme={runId === null ? "primary.blue" : "gray"} // Use company blue for trace button
              onClick={(e) => {
                e.preventDefault();
                viewTrace();
              }}
              isLoading={traceIsLoading}
              loadingText="🔄"
            >
              🛠️ View trace
            </Button>

          </HStack>
        )}
  
      {!isUser && <Divider mt={4} mb={4} />}
    </VStack>
  );

}
