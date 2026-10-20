-- Herramientas de las pruebas (las usan rls.sql y automatizacion.sql con \ir).
-- Cada función anota en t.resultados si lo que se probó salió como se esperaba.

create schema if not exists t;
create table t.resultados (n serial, nombre text, ok boolean, detalle text);
grant usage on schema t to public;
grant all on t.resultados to public;
grant usage on sequence t.resultados_n_seq to public;

create function t.como(sub uuid, email text, amr text default 'otp') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', sub, 'email', email, 'role', 'authenticated',
                      'amr', json_build_array(json_build_object('method', amr)))::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function t.anonimo() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create function t.root() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Ejecuta una sentencia y anota si funcionó o dio error.
create function t.debe_funcionar(nombre text, sentencia text) returns void language plpgsql as $$
begin
  begin execute sentencia; insert into t.resultados(nombre, ok) values (nombre, true);
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, false, sqlerrm); end;
end $$;
create function t.debe_fallar(nombre text, sentencia text) returns void language plpgsql as $$
begin
  begin execute sentencia; insert into t.resultados(nombre, ok, detalle) values (nombre, false, 'se ejecutó y no debía');
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, true, sqlerrm); end;
end $$;
-- Cuenta filas visibles y compara con lo esperado.
create function t.filas(nombre text, consulta text, esperado bigint) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute 'select count(*) from (' || consulta || ') q' into n;
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, false, sqlerrm); return; end;
  insert into t.resultados(nombre, ok, detalle) values (nombre, n = esperado, 'filas=' || n || ' esperadas=' || esperado);
end $$;
-- Cuenta cuántas filas toca un UPDATE o DELETE (la política puede dejar pasar 0 sin error).
create function t.afecta(nombre text, dml text, esperado bigint) returns void language plpgsql as $$
declare n bigint;
begin
  begin execute 'with x as (' || dml || ' returning 1) select count(*) from x' into n;
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, esperado = 0, 'error: ' || sqlerrm); return; end;
  insert into t.resultados(nombre, ok, detalle) values (nombre, n = esperado, 'filas tocadas=' || n || ' esperadas=' || esperado);
end $$;

create function t.valor(nombre text, consulta text, esperado text) returns void language plpgsql as $$
declare v text;
begin
  begin execute consulta into v;
  exception when others then insert into t.resultados(nombre, ok, detalle) values (nombre, false, sqlerrm); return; end;
  insert into t.resultados(nombre, ok, detalle) values (nombre, v is not distinct from esperado, 'valor=' || coalesce(v, 'null') || ' esperado=' || esperado);
end $$;

-- La fecha de hoy en Santiago (la base usa esa, no la de UTC: de noche difieren).
create function t.hoy() returns date language sql stable as $$ select (now() at time zone 'America/Santiago')::date $$;
