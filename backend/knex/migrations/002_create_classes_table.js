exports.up = function(knex) {
  return knex.schema.createTable('classes', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name').notNullable();
    table.integer('grade').notNullable();
    table.string('letter').notNullable();
    table.uuid('class_teacher_id').references('id').inTable('users').onDelete('SET NULL');
    table.json('students').defaultTo('[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index(['grade']);
    table.index(['class_teacher_id']);
    table.unique(['grade', 'letter']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('classes');
};
