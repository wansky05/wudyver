import {
  redirect,
  notFound
} from "next/navigation";
import dbConnect from "@/lib/mongoose";
import shortLink from "@/models/shortlink";

async function ShortLinkRedirectPage({
  params
}) {
  await dbConnect();

  const {
    shortId
  } = params;

  const link = await shortLink.findOne({
    id: shortId
  }).lean();

  if (link) {
    redirect(link.url);
  } else {
    notFound();
  }

  return null;
}

export default ShortLinkRedirectPage;