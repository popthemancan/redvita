import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { View } from "react-native";

type Props = {
  source: { html: string };
  onMessage?: (e: { nativeEvent: { data: string } }) => void;
  style?: unknown;
  [k: string]: unknown;
};
export type WebViewMessageEvent = { nativeEvent: { data: string } };

export const WebView = forwardRef(function WebView({ source, onMessage, style }: Props, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const onMsg = useRef(onMessage);
  onMsg.current = onMessage;

  useImperativeHandle(ref, () => ({
    injectJavaScript(js: string) {
      const win = frame.current?.contentWindow as (Window & { eval: (s: string) => unknown }) | null;
      try {
        win?.eval(js);
      } catch (e) {
        console.warn("webview inject failed", e);
      }
    },
  }));

  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    const hook = () => {
      const win = f.contentWindow as Window & { ReactNativeWebView?: unknown };
      win.ReactNativeWebView = { postMessage: (data: string) => onMsg.current?.({ nativeEvent: { data } }) };
    };
    f.srcdoc = source.html.replace("<script>", "<script>window.ReactNativeWebView=parent.__rnwvBridge;</script><script>");
    (window as unknown as { __rnwvBridge: unknown }).__rnwvBridge = {
      postMessage: (data: string) => onMsg.current?.({ nativeEvent: { data } }),
    };
    f.addEventListener("load", hook);
    return () => f.removeEventListener("load", hook);
  }, [source.html]);

  return (
    <View style={style as never}>
      <iframe ref={frame} style={{ border: 0, width: "100%", height: "100%" }} title="map" />
    </View>
  );
});

export default WebView;
