module.exports = {
  name: 'Mail_Account',
  base: 'PersistedModel',
  properties: {
    email: {
      type: 'string'
    }
  },
  indexes: {
    unique: {
      keys: {
        email: 1
      },
      options: {
        unique: true
      }
    }
  },
  validations: [],
  mixins: {},
  relations: {
    users: {
      type: 'hasMany',
      model: 'Account',
      foreignKey: 'userId',
      through: 'MailAccountUser'
    }
  }
};
