"use client";

import React, { useEffect, useRef, useState } from "react";

import { RemoteRunnable } from "@langchain/core/runnables/remote";
import { applyPatch } from "@langchain/core/utils/json_patch";
import DOMPurify from "dompurify";

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
        url: apiBaseUrl + "/chat",
        options: {
          timeout: 60_000,
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
            conversation_id: conversationId,
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
              title: DOMPurify.sanitize(doc.metadata.title, { ALLOWED_TAGS: [] }),
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

  return (
    <div className="flex flex-col items-center p-8 rounded grow max-h-full" style={{ maxWidth: '1280px', margin: '0 auto' }}>
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
          <Text fontSize="md" fontWeight="normal" mb={1} color="secondary.magenta" style={{ color: '#4a4a4a' }}>
            Got feedback? We&apos;d love to hear it!
          </Text>
        ) : (
          <>
            <Text
              fontSize="xl"
              fontWeight="normal"
              mt="10px"
              textAlign="center"
              textColor="gray.600"
            >
              Ask me anything about cplace and get instant answers!
            </Text>
  
            {/* Chakra Text component used for the disclaimer */}
            <Text fontSize="sm" mt="10px" color="gray.500" textAlign="justify" maxWidth="800px">
              Note on the use of the chatbot: Our new AI-based chatbot is currently in the testing phase. While it is designed to help you answer your questions about the cplace platform, the answers may vary in quality and accuracy. Please check the sources it provides and also consult the classic index-based search in our Knowledge Base if necessary.
            </Text>
          </>
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
      <InputGroup size="md" alignItems={"center"} width="100%" minW="600px">
        <AutoResizeTextarea
          autoFocus
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