import ProjectorClient from "./ProjectorClient";

export default function ProjectorPage({ params }: { params: { sessionId: string } }) {
  return <ProjectorClient sessionId={params.sessionId} />;
}
