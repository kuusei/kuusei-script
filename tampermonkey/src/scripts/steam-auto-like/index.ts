import { whenDocumentReady } from "@/shared";
import { loadConfig } from "./model/config";
import { mountPanel } from "./ui/panel";

whenDocumentReady(() => mountPanel(loadConfig()));
