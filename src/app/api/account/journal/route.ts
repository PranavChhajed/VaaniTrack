import { accountDb, accountFailure, AccountError, requireAccount, sameOrigin } from "@/lib/account/server";
import { mutateJournal, readJournal } from "@/lib/account/journal";

export async function GET(request: Request) {
  try {
    const account = await requireAccount(request);
    if (request.headers.get("x-vaani-account") !== account.id) throw new AccountError(409, "Account changed; sign in again");
    return Response.json({ rows: await readJournal(accountDb(), account.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountFailure(error); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new AccountError(403, "Invalid origin");
    const account = await requireAccount(request);
    if (request.headers.get("x-vaani-account") !== account.id) throw new AccountError(409, "Account changed; sign in again");
    const body = await request.text();
    if (body.length > 20000) throw new AccountError(413, "Change too large");
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new AccountError(400, "Invalid change"); }
    const result = await mutateJournal(accountDb(), account.id, input);
    return Response.json(result, { status: result.conflict ? 409 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountFailure(error); }
}
