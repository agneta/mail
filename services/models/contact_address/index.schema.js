module.exports = {
  name: 'Contact_Address',
  base: 'PersistedModel',
  properties: {
    name: {
      type: 'string',
      required: false
    },
    email: {
      type: 'string',
      required: true
    }
  },
  validations: [],
  mixins: {},
  relations: {
    emails: {
      type: 'hasMany',
      model: 'Contact_Email',
      foreignKey: 'addressId',
      through: 'Contact_Email_Address'
    }
  },
  indexes: {
    search: {
      keys: {
        email: 'text'
      }
    },
    email: {
      keys: {
        email: 1
      },
      options: {
        unique: true
      }
    }
  },
  methods: {}
};