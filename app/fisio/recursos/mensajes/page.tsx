import { prisma } from "@/lib/prisma";
import { MessageTemplatesList } from "@/components/MessageTemplatesList";

export default async function MessagesPage() {
  const messages = await prisma.messageTemplate.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <MessageTemplatesList
      messages={messages.map((m) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        body: m.body,
      }))}
    />
  );
}
