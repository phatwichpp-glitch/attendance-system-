import { Suspense } from "react";
import CourseProjectorClient from "./CourseProjectorClient";

export default async function CourseProjectorPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  return (
    <Suspense fallback={null}>
      <CourseProjectorClient courseId={courseId} />
    </Suspense>
  );
}
