import "@fontsource/orbitron/700.css";
import "@fontsource/noto-sans-sc/400.css";
import "@fontsource/noto-sans-sc/500.css";
import "@fontsource/noto-sans-sc/700.css";
import "antd/dist/reset.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      form={{
        validateMessages: {
          required: "${label}不能为空。",
        },
      }}
      theme={{
        token: {
          colorPrimary: "#5fdaff",
          colorInfo: "#5fdaff",
          colorBgBase: "#0a1324",
          borderRadius: 18,
          fontFamily: '"Noto Sans SC", sans-serif',
        },
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
