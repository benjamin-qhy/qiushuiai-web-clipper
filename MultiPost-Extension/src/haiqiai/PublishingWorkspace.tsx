import React from "react";
import { Button, Card, CardBody, HeroUIProvider } from "@heroui/react";
import { Send } from "lucide-react";
import messages from "./messages.json";

function message(key: keyof typeof messages): string {
  return globalThis.chrome?.i18n?.getMessage(key) || messages[key].message;
}

export default function PublishingWorkspace() {
  return (
    <HeroUIProvider>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Send aria-hidden="true" size={24} />
            <h1 className="text-2xl font-semibold">{message("hqPublishTitle")}</h1>
          </div>
          <a className="text-primary underline" href="/options.html">{message("hqClipperSettings")}</a>
        </header>
        <Card>
          <CardBody className="gap-4 p-6">
            <h2 className="text-lg font-medium">{message("hqPublishDisconnected")}</h2>
            <p className="text-default-600">{message("hqPublishPending")}</p>
            <Button isDisabled color="primary" className="self-start">{message("hqPublishAwaitingService")}</Button>
          </CardBody>
        </Card>
      </main>
    </HeroUIProvider>
  );
}
