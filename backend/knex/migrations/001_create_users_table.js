exports.up = function(knex) {
  return knex.schema.createTable('users', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email').unique().notNullable();
    table.string('password').notNullable();
    table.enu('role', ['student', 'teacher', 'parent', 'admin']).notNullable();
    table.string('first_name').notNullable();
    table.string('last_name').notNullable();
    table.string('middle_name');
    table.string('phone');
    table.string('avatar');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index(['email']);
    table.index(['role']);
    table.index(['is_active']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('users');
};
