import { Bots, Props } from "./bots";

export default function Command(props: Props) {
  return (
    <Bots
      mode="message"
      initialMessage={props.arguments.message ?? ""}
      target={props.launchContext}
    />
  );
}
