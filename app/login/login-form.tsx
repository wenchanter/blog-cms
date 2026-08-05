"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/actions/auth";
import { Alert, Button, Field, Input } from "@/app/components/ui";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      {state?.error && <Alert tone="error">{state.error}</Alert>}

      <Field label="邮箱" htmlFor="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="you@example.com"
          required
          maxLength={254}
          spellCheck={false}
          // React resets the form once the action settles; this restores the
          // address the user typed so only the password must be retyped.
          defaultValue={state?.email ?? ""}
        />
      </Field>

      <Field label="密码" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••••••"
          required
          maxLength={200}
        />
      </Field>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={pending}
        className="mt-2 w-full"
      >
        {pending ? "登录中…" : "登录"}
      </Button>
    </form>
  );
}
