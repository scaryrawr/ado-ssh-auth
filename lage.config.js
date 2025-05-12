module.exports = {
  pipeline: {
    build: ["transpile", "typecheck"],
    test: ["build"],
    lint: [],
    transpile: [],
    typecheck: [],
  },
  npmClient: "yarn",
};
