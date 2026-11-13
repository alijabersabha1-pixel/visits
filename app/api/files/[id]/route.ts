import { handler, apiRequire, notFound } from "@/lib/api";
import { idParam } from "@/lib/route-params";
import { readAttachment } from "@/lib/attachments";

/** الصور بتنخدم بس للي داخل، وبنوع ثابت ما بيتنفّذ */
export const GET = handler<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await apiRequire(req, "visits:view");
  const file = await readAttachment(await idParam(params));
  if (!file) throw notFound();
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
});
