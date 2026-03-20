import type { Year } from "../lib/types";
import data from "../../output.json";

const years = data as Year[];

console.log(JSON.stringify(years, null, 2));
