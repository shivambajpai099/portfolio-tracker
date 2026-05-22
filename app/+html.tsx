import type { PropsWithChildren } from "react";
import { ScrollViewStyleReset } from "expo-router/html";

const APP_FAVICON_DATA_URI =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2064%2064'%3E%3Crect%20width='64'%20height='64'%20rx='14'%20fill='%230B0C10'/%3E%3Ctext%20x='50%25'%20y='57%25'%20font-size='38'%20text-anchor='middle'%20fill='%236366F1'%3E%E2%82%B9%3C/text%3E%3C/svg%3E";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <title>Portfolio Tracker</title>
        <meta name="theme-color" content="#0B0C10" />
        <link rel="icon" href={APP_FAVICON_DATA_URI} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}


