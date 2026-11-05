"use strict";
(() => {
  const node = (tag, content) => {
    const el = document.createElement(tag);
    if (content !== undefined) el.textContent = content;
    return el;
  };
  function button(label, handler) {
    const b = node("button", label);
    b.type = "button";
    b.addEventListener("click", async () => {
      b.disabled = true;
      try {
        await handler();
      } catch (e) {
        alert(e.message);
      } finally {
        b.disabled = false;
      }
    });
    return b;
  }
  function passwordDialog(title, onSubmit, own = false) {
    const dialog = node("dialog"),
      form = node("form");
    dialog.append(form);
    form.append(node("h2", title));
    const add = (label, name) => {
      const l = node("label", label),
        input = node("input");
      input.name = name;
      input.type = "password";
      input.required = true;
      input.maxLength = 256;
      input.autocomplete =
        name === "actual" ? "current-password" : "new-password";
      if (name !== "actual") input.minLength = 8;
      l.append(input);
      form.append(l);
      return input;
    };
    const actual = own ? add("Contraseña actual", "actual") : null,
      p = add("Contraseña nueva (mínimo 8 caracteres)", "password"),
      c = add("Repetir contraseña", "confirmacion");
    form.append(
      button("Mostrar / ocultar contraseña", () => {
        p.type = c.type = p.type === "password" ? "text" : "password";
      }),
    );
    const save = node("button", "Guardar contraseña");
    save.type = "submit";
    save.className = "primary";
    form.append(
      save,
      button("Cancelar", () => dialog.close()),
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (p.value !== c.value) {
        alert("Las contraseñas no coinciden");
        return;
      }
      save.disabled = true;
      try {
        await onSubmit(p.value, actual?.value);
        dialog.close();
      } catch (err) {
        alert(err.message);
      } finally {
        save.disabled = false;
      }
    });
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }
  function renderAccount(host = document.querySelector("#content")) {
    if (!host) return;
    const account = node("section");
    account.id = "session-panel";
    account.className = "panel users-panel";
    account.append(
      node("h2", "Sesión"),
      node(
        "p",
        "Usuario activo: " + VSAuth.user.nombre + " · " + VSAuth.user.rol,
      ),
    );
    account.append(
      button("Cambiar mi contraseña", () =>
        passwordDialog(
          "Cambiar mi contraseña",
          async (password, actual) => {
            const result = await VSAuth.json("/auth/change-password", "POST", {
              password,
              actual,
            });
            VSAuth.useSession(result);
            location.reload();
          },
          true,
        ),
      ),
      button("Cerrar sesión", () => VSAuth.logout()),
    );
    host.append(account);
  }
  function renderUsers(host = document.querySelector("#content")) {
    if (!host) return;
    if (VSAuth.user.rol !== "administrador") {
      host.append(node("p", "Solo un administrador puede gestionar usuarios."));
      return;
    }
    const section = node("section");
    section.className = "panel users-panel";
    section.append(node("h2", "Gestión de usuarios"));
    const rolesInfo = node("details");
    rolesInfo.className = "user-role-info";
    rolesInfo.append(
      node("summary", "Tipos de usuario"),
      node(
        "p",
        "Administrador: gestiona usuarios y tiene acceso a todos los apartados de la aplicación.",
      ),
      node(
        "p",
        "Empleado: gestiona el trabajo diario, sin acceso a la administración de usuarios.",
      ),
    );
    section.append(rolesInfo);
    const list = node("div");
    list.className = "user-list";
    section.append(list);
    const form = node("form");
    form.append(node("h3", "Crear usuario"));
    for (const [name, label, type] of [
      ["nombre", "Nombre", "text"],
      ["usuario", "Usuario", "text"],
      ["password", "Contraseña (mínimo 8 caracteres)", "password"],
    ]) {
      const l = node("label", label),
        input = node("input");
      input.name = name;
      input.type = type;
      input.required = true;
      input.maxLength = name === "nombre" ? 100 : name === "usuario" ? 50 : 256;
      input.autocomplete = name === "password" ? "new-password" : "off";
      if (name === "password") input.minLength = 8;
      if (name === "usuario") {
        input.pattern = "[a-zA-Z0-9._-]{1,50}";
        input.autocapitalize = "none";
      }
      l.append(input);
      form.append(l);
    }
    const l = node("label", "Rol"),
      roles = node("select");
    roles.name = "rol";
    for (const role of ["empleado", "administrador"]) {
      const o = node(
        "option",
        role === "empleado" ? "Empleado" : "Administrador",
      );
      o.value = role;
      roles.append(o);
    }
    l.append(roles);
    form.append(l);
    form.append(
      button("Mostrar / ocultar contraseña", () => {
        const p = form.elements.password;
        p.type = p.type === "password" ? "text" : "password";
      }),
    );
    const create = node("button", "Crear usuario");
    create.type = "submit";
    create.className = "primary";
    form.append(create);
    section.append(form);
    host.append(section);
    async function refresh() {
      const result = await VSAuth.json("/admin/users");
      if (!section.isConnected) return;
      list.replaceChildren();
      for (const u of result.users) {
        const row = node("article");
        row.className = "user-row";
        row.append(
          node("strong", u.nombre),
          node(
            "p",
            u.usuario +
              " · " +
              u.rol +
              " · " +
              (u.activo ? "Activo" : "Desactivado"),
          ),
        );
        const actions = node("div");
        actions.className = "actions";
        actions.append(
          button("Cambiar contraseña", () =>
            passwordDialog("Contraseña de " + u.nombre, async (password) => {
              await VSAuth.json("/admin/users/" + u.id + "/password", "POST", {
                password,
              });
              if (u.id === VSAuth.user.id) await VSAuth.json("/auth/me");
              await refresh();
            }),
          ),
          button(u.activo ? "Desactivar" : "Activar", async () => {
            if (
              !confirm(
                (u.activo ? "¿Desactivar a " : "¿Activar a ") +
                  u.nombre +
                  "? Sus sesiones quedarán revocadas.",
              )
            )
              return;
            await VSAuth.json("/admin/users/" + u.id, "PATCH", {
              activo: !u.activo,
            });
            await refresh();
          }),
          button("Eliminar", async () => {
            if (!confirm("¿Eliminar a " + u.nombre + "?")) return;
            await VSAuth.json("/admin/users/" + u.id, "DELETE");
            await refresh();
          }),
        );
        row.append(actions);
        list.append(row);
      }
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      create.disabled = true;
      try {
        await VSAuth.json(
          "/admin/users",
          "POST",
          Object.fromEntries(new FormData(form)),
        );
        form.reset();
        await refresh();
      } catch (err) {
        alert(err.message);
      } finally {
        create.disabled = false;
      }
    });
    refresh().catch((e) => {
      list.textContent = e.message;
    });
  }
  function renderMigration(host = document.querySelector("#content")) {
    if (!host || VSAuth.user.rol !== "administrador") return;
    const migration = node("section");
    migration.className = "panel";
    migration.append(
      node("h2", "Importar datos existentes"),
      node(
        "p",
        "Importa los datos locales de este dispositivo o una copia JSON. Se revisarán antes de sustituir el servidor y se conservará el original.",
      ),
    );
    const status = node("p");
    status.id = "migration-status";
    status.setAttribute("role", "status");
    migration.append(
      button("Revisar e importar datos de este dispositivo", async () => {
        await VSMigration.importData(await VSMigration.localData());
      }),
      status,
    );
    host.append(migration);
  }
  window.VSUsers = { renderAccount, renderUsers, renderMigration };
})();
