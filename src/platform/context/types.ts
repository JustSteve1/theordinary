/** One block a chat can be given. Add or remove sources without changing the chat screen. */
export type ContextSource = {
  id: string;
  load: (userId: string) => Promise<string | null>;
};
