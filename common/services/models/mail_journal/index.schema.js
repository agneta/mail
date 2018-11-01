module.exports = {
  name: 'Mail_Journal',
  base: 'PersistedModel',
  properties: {
    command: {
      type: 'string',
      required: true
    },
    flags: {
      type: 'array'
    },
    message: {
      type: 'objectId'
    },
    uid: {
      type: 'string'
    }
  },
  indexes: {},
  methods: {}
};
