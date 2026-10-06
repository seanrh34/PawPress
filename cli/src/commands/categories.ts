import { optBool, optString, parseOptions } from '../args';
import { CliError, EXIT, usageError } from '../errors';
import { assertUuid } from '../ids';
import { makeClient } from '../runtime';
import { truncate } from '../output';
import type { Context } from '../runtime';
import type { Category, CategoryList, DeletedResponse } from '../types';
import { printCategorySummary, renderPlan } from './shared';

export async function categoriesCommand(ctx: Context, args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'list':
      return categoriesList(ctx, rest);
    case 'create':
      return categoriesCreate(ctx, rest);
    case 'update':
      return categoriesUpdate(ctx, rest);
    case 'delete':
      return categoriesDelete(ctx, rest);
    case undefined:
      throw usageError('categories requires a subcommand');
    default:
      throw usageError(`unknown categories subcommand: ${sub}`);
  }
}

async function categoriesList(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  parseOptions(args, {}, false);
  const client = await makeClient(ctx);
  const result = await client.request<CategoryList>({ method: 'GET', path: '/api/v1/categories' });
  if (out.json) {
    out.jsonDoc(result);
    return;
  }
  out.table(
    ['id', 'slug', 'name', 'description'],
    result.items.map((category) => [
      category.id,
      category.slug,
      truncate(category.name, 30),
      truncate(category.description ?? '', 40),
    ]),
  );
}

async function categoriesCreate(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values } = parseOptions(
    args,
    {
      name: { type: 'string' },
      slug: { type: 'string' },
      description: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
    false,
  );
  const name = optString(values, 'name');
  const slug = optString(values, 'slug');
  const description = optString(values, 'description');
  if (!name) throw usageError('categories create requires --name');
  if (!slug) throw usageError('categories create requires --slug');
  if (!description) throw usageError('categories create requires --description');
  const body = { name, slug, description };
  const path = '/api/v1/categories';

  if (optBool(values, 'dry-run')) {
    renderPlan(out, [{ method: 'POST', path, body }], []);
    return;
  }
  const client = await makeClient(ctx);
  const category = await client.request<Category>({ method: 'POST', path, json: body });
  if (out.json) out.jsonDoc(category);
  else printCategorySummary(out, category);
}

async function categoriesUpdate(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    {
      name: { type: 'string' },
      slug: { type: 'string' },
      description: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
    true,
  );
  const [rawId, ...extra] = positionals;
  if (!rawId) throw usageError('categories update requires an <id>');
  if (extra.length > 0) throw usageError('categories update accepts a single <id>');
  const id = assertUuid(rawId, 'category id');

  const body: Record<string, unknown> = {};
  const name = optString(values, 'name');
  const slug = optString(values, 'slug');
  const description = optString(values, 'description');
  if (name !== undefined) body.name = name;
  if (slug !== undefined) body.slug = slug;
  if (description !== undefined) body.description = description;
  if (Object.keys(body).length === 0) {
    throw usageError('categories update requires at least one field to change');
  }

  const path = `/api/v1/categories/${encodeURIComponent(id)}`;
  if (optBool(values, 'dry-run')) {
    renderPlan(out, [{ method: 'PATCH', path, body }], []);
    return;
  }
  const client = await makeClient(ctx);
  const category = await client.request<Category>({ method: 'PATCH', path, json: body });
  if (out.json) out.jsonDoc(category);
  else printCategorySummary(out, category);
}

async function categoriesDelete(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { values, positionals } = parseOptions(
    args,
    { yes: { type: 'boolean' }, 'dry-run': { type: 'boolean' } },
    true,
  );
  const [rawId, ...extra] = positionals;
  if (!rawId) throw usageError('categories delete requires an <id>');
  if (extra.length > 0) throw usageError('categories delete accepts a single <id>');
  const id = assertUuid(rawId, 'category id');
  if (!optBool(values, 'yes')) throw usageError('categories delete requires --yes');

  const path = `/api/v1/categories/${encodeURIComponent(id)}`;
  if (optBool(values, 'dry-run')) {
    renderPlan(out, [{ method: 'DELETE', path }], []);
    return;
  }
  const client = await makeClient(ctx);
  try {
    const result = await client.request<DeletedResponse>({ method: 'DELETE', path });
    if (out.json) out.jsonDoc(result);
    else out.line(`Deleted category ${result.id}`);
  } catch (error) {
    if (error instanceof CliError && error.exitCode === EXIT.CONFLICT) {
      throw new CliError(`${error.message}; move or delete its posts first`, EXIT.CONFLICT, {
        code: error.code ?? 'conflict',
        details: error.details,
      });
    }
    throw error;
  }
}
