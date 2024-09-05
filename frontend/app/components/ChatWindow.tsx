"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RemoteRunnable } from "@langchain/core/runnables/remote";
import { applyPatch } from "@langchain/core/utils/json_patch";

import { EmptyState } from "./EmptyState";
import { ChatMessageBubble, Message } from "./ChatMessageBubble";
import { AutoResizeTextarea } from "./AutoResizeTextarea";

import "react-toastify/dist/ReactToastify.css";
import {
  Heading,
  Flex,
  IconButton,
  InputGroup,
  InputRightElement,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { ArrowUpIcon } from "@chakra-ui/icons";
import { Select, Link } from "@chakra-ui/react";
import { apiBaseUrl } from "../utils/constants";

export function ChatWindow(props: { conversationId: string }) {
  const conversationId = props.conversationId;

  const searchParams = useSearchParams();

  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<Array<Message>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [chatHistory, setChatHistory] = useState<
    { human: string; ai: string }[]
  >([]);

  const sendMessage = async (message?: string) => {
    if (messageContainerRef.current) {
      messageContainerRef.current.classList.add("grow");
    }
    if (isLoading) {
      return;
    }
    const messageValue = message ?? input;
    if (messageValue === "") return;
    setInput("");
    setMessages((prevMessages) => [
      ...prevMessages,
      { id: Math.random().toString(), content: messageValue, type: "human" },
    ]);
    setIsLoading(true);

    try {
      const sourceStepName = "FindDocs";
      let streamedResponse: Record<string, any> = {}; // To accumulate the streamed response
      let accumulatedMessage = ""; // This will accumulate the AI's streamed response
      let sources: { url: string; title: string }[] = []; // Array to store sources
      let messageIndex: number | null = null;
      let runId: string | undefined = undefined;

      const remoteChain = new RemoteRunnable({
        url: apiBaseUrl + "/chat", // Ensure the correct API URL
        options: {
          timeout: 120000, // Timeout of 120 seconds
        },
      });

      // Start streaming the AI response
      const streamLog = remoteChain.streamLog(
        {
          question: messageValue, // The user's question or input
          chat_history: chatHistory, // The conversation history sent to the backend
        },
        {
          configurable: {},
          tags: [],
          metadata: {
            conversation_id: conversationId, // Metadata for conversation ID
          },
        },
        {
          includeNames: [sourceStepName], // Request that includes specific logs
        }
      );

      // For each chunk in the stream, handle the patch and update the message
      for await (const chunk of streamLog) {
        // Log the received chunk for debugging
        //console.log("Received chunk:", chunk);

        // Apply JSON patch updates to the streamed response
        streamedResponse = applyPatch(streamedResponse, chunk.ops, undefined, false).newDocument;

        // If the response contains sources, update them
        if (Array.isArray(streamedResponse?.logs?.[sourceStepName]?.final_output?.output)) {
          sources = streamedResponse.logs[sourceStepName].final_output.output.map(
            (doc: Record<string, any>) => ({
              url: doc.metadata.source,
              title: doc.metadata.title,
            })
          );
        }

        // Capture the run ID if it is available
        if (streamedResponse.id !== undefined) {
          runId = streamedResponse.id;
        }

        // Check if the streamed_output is an array
        if (Array.isArray(streamedResponse?.streamed_output)) {
          // Concatenate the valid chunks to the accumulated message (raw text)
          accumulatedMessage = streamedResponse?.streamed_output.join("");

          // Update the message state to display raw streaming text (no markdown)
          setMessages((prevMessages) => {
            let newMessages = [...prevMessages];

            // If it's the first chunk, create a new message
            if (messageIndex === null || newMessages[messageIndex] === undefined) {
              messageIndex = newMessages.length;
              newMessages.push({
                id: Math.random().toString(),
                content: accumulatedMessage,
                runId: runId,
                sources: sources,
                type: "ai",
              });
            } else if (newMessages[messageIndex] !== undefined) {
              // If more chunks are received, update the existing message with raw text
              newMessages[messageIndex].content = streamedResponse?.streamed_output.join("");
              newMessages[messageIndex].runId = runId;
              newMessages[messageIndex].sources = sources;
            }
            return newMessages;
          });
        }
      }

      // Update the chat history once the streaming is complete
      setChatHistory((prevChatHistory) => [
        ...prevChatHistory,
        { human: messageValue, ai: accumulatedMessage },
      ]);

      // Stop the loading indicator
      setIsLoading(false);

    } catch (e) {
      // Handle errors and rollback
      console.error("Error during streaming:", e);  // Log any error for debugging
      setMessages((prevMessages) => prevMessages.slice(0, -1));  // Remove the last AI message
      setIsLoading(false);  // Stop the loading indicator
      setInput(messageValue);  // Restore the input for retry
      throw e;  // Rethrow the error for further handling
    }
  }

  const sendInitialQuestion = async (question: string) => {
    await sendMessage(question);
  };

  const insertUrlParam = (key: string, value?: string) => {
    if (window.history.pushState) {
      const searchParams = new URLSearchParams(window.location.search);
      searchParams.set(key, value ?? "");
      const newurl =
        window.location.protocol +
        "//" +
        window.location.host +
        window.location.pathname +
        "?" +
        searchParams.toString();
      window.history.pushState({ path: newurl }, "", newurl);
    }
  };

  return (
    <div className="flex flex-col items-center p-8 rounded grow max-h-full">
    <Flex
      direction="column"
      alignItems="center"
      marginTop={messages.length > 0 ? "0" : "64px"}
    >
    <Heading
      fontSize={messages.length > 0 ? "2xl" : "3xl"}
      fontWeight="medium"
      mb={1}
      color="primary.blue"
    >
      cplace Knowledge Chatbot
    </Heading>

    {messages.length > 0 ? (
      <Text fontSize="md" fontWeight="normal" mb={1} color="secondary.magenta">
        Got feedback? We'd love to hear it!
      </Text>
    ) : (
      <Text
        fontSize="xl"
        fontWeight="normal"
        mt="10px"
        textAlign="center"
        color="secondary.orange"
      >
        Ask me anything about cplace's{" "}
        <Link href="https://docs.cplace.io/" isExternal color="secondary.orangeLight">
          official documentation
        </Link>{" "}
        or the{" "}
        <Link href="https://discuss.cplace.io/" isExternal color="secondary.orangeLight">
          Discuss Forum
        </Link>
        !
      </Text>
    )}
    </Flex>

      <div
        className="flex flex-col-reverse w-full mb-2 overflow-auto"
        ref={messageContainerRef}
      >
        {messages.length > 0 ? (
          [...messages]
            .reverse()
            .map((m, index) => (
              <ChatMessageBubble
                key={m.id}
                message={{ ...m }}
                aiEmoji="🦜"
                isMostRecent={index === 0}
                messageCompleted={!isLoading}
              ></ChatMessageBubble>
            ))
        ) : (
          <EmptyState onChoice={sendInitialQuestion} />
        )}
      </div>
      <InputGroup size="md" alignItems={"center"}>
        <AutoResizeTextarea
          value={input}
          maxRows={5}
          marginRight={"56px"}
          placeholder="Ask me a question..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            } else if (e.key === "Enter" && e.shiftKey) {
              e.preventDefault();
              setInput(input + "\n");
            }
          }}
        />
        <InputRightElement h="full">
          <IconButton
            rounded={"full"}
            aria-label="Send"
            icon={isLoading ? <Spinner /> : <ArrowUpIcon />}
            type="submit"
            onClick={(e) => {
              e.preventDefault();
              sendMessage();
            }}
          />
        </InputRightElement>
      </InputGroup>

      {messages.length === 0 ? (
        <footer className="flex justify-center absolute bottom-8">
          <a
            href="https://github.com/cf-sewe/cplace-docs-chat"
            target="_blank"
            className="flex items-center"
          >
            <img alt="GitHub Logo" src="/images/github-mark.svg" className="h-4 mr-1" />
            <span>View Source</span>
          </a>
        </footer>
      ) : (
        ""
      )}
    </div>
  );
}
