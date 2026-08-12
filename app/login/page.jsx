import { LoginView } from "./view.jsx";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in — User Access" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  return (
    <LoginView
      next={typeof params?.next === "string" ? params.next : "/"}
      // Named so the form can say what is wrong rather than failing on submit
      // with a message about credentials, which would be untrue and unfixable.
      secretMissing={!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32}
    />
  );
}
