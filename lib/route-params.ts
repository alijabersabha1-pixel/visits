import { z } from "zod";
import { notFound } from "./errors";

/** رقم داخلي (uuid) من رابط الـ API، وإلا 404 */
export async function idParam(params: Promise<{ id: string }>): Promise<string> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) throw notFound();
  return id;
}
