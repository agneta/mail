module.exports = {
  name: 'Mail_Box_Address',
  base: 'PersistedModel',
  properties: {
    type: {
      type: 'string'
    },
    date: {
      type: 'date'
    },
    emailId: {
      type: 'string',
      required: true
    },
    addressId: {
      type: 'string',
      required: true
    }
  },
  validations: [],
  relations: {
    email: {
      type: 'belongsTo',
      model: 'Mail_Box',
      foreignKey: 'emailId'
    },
    address: {
      type: 'belongsTo',
      model: 'Mail_Address',
      foreignKey: 'addressId'
    }
  },
  indexes: {
    email: {
      keys: {
        addressId: 1,
        emailId: 1,
        type: 1
      },
      options: {
        unique: true
      }
    }
  }
};
