"use client";

import { v4 as uuidv4 } from "uuid";
import { ChatWindow } from "./components/ChatWindow";
import { ToastContainer } from "react-toastify";

import { ChakraProvider } from "@chakra-ui/react";
import theme from "./theme";

export default function Home() {
  return (
    <ChakraProvider theme={theme}>
      <ToastContainer />
      <ChatWindow conversationId={uuidv4()}></ChatWindow>
    </ChakraProvider>
  );
}
