// This file defines a custom auto-resizing textarea component using Chakra UI's Textarea and 
// the react-textarea-autosize library. It provides a seamless way to create a textarea that 
// automatically adjusts its height based on the content, with an optional maxRows limit.
// 
// The main purpose of the AutoResizeTextarea component is to create a user-friendly textarea 
// that resizes dynamically as the user types, making it more convenient for multi-line inputs 
// without manual resizing. It combines Chakra UI's Textarea with the resizing functionality 
// from the react-textarea-autosize library.

import { Textarea, TextareaProps } from "@chakra-ui/react";
import ResizeTextarea from "react-textarea-autosize";
import React from "react";

interface ResizeTextareaProps {
  maxRows?: number;
}

const ResizableTextarea: React.FC<ResizeTextareaProps> = ({
  maxRows,
  ...props
}) => {
  return <ResizeTextarea maxRows={maxRows} {...props} />;
};

interface AutoResizeTextareaProps extends TextareaProps {
  maxRows?: number;
}

export const AutoResizeTextarea = React.forwardRef<
  HTMLTextAreaElement,
  AutoResizeTextareaProps
>((props, ref) => {
  return (
    <Textarea
      minH="unset"
      overflow="auto"
      w="100%"
      resize="none"
      ref={ref as React.RefObject<HTMLTextAreaElement>}
      as={ResizableTextarea}
      {...props}
    />
  );
});

AutoResizeTextarea.displayName = "AutoResizeTextarea";
