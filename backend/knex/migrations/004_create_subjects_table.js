exports.up = function(knex) {
  return knex.schema.createTable('subjects', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name').notNullable();
    table.string('name_kz');
    table.string('color').defaultTo('#3B82F6');
    table.string('icon');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index(['name']);
    table.unique(['name']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('subjects');
};
