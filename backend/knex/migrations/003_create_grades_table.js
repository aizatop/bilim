exports.up = function(knex) {
  return knex.schema.createTable('grades', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('student_id').references('id').inTable('users').onDelete('CASCADE');
    table.uuid('subject_id').references('id').inTable('subjects').onDelete('CASCADE');
    table.uuid('teacher_id').references('id').inTable('users').onDelete('SET NULL');
    table.enu('type', ['СОЧ', 'СОР', 'ДЗ', 'КР', 'ТР']).notNullable();
    table.integer('score').notNullable();
    table.integer('max_score').notNullable();
    table.date('date').notNullable();
    table.integer('quarter').notNullable();
    table.string('topic');
    table.text('description');
    table.timestamps(true, true);
    
    table.index(['student_id']);
    table.index(['subject_id']);
    table.index(['teacher_id']);
    table.index(['date']);
    table.index(['quarter']);
    table.index(['type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTable('grades');
};
