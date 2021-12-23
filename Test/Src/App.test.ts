import { Class } from "@Src/Class";
import test, { ExecutionContext } from "ava";

test("Example Test", (t: ExecutionContext): void =>
{
    const lClass: Class = new Class();
    lClass.LogHelloWorld();

    t.pass();
});
