import ProjectorClient from "./ProjectorClient";

export default async function ProjectorPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ProjectorClient sessionId={sessionId} />;
}
